# Legal notice

**Short version: this repository contains no Sunsoft material, and you need
your own copy of the cartridge to build or run anything.**

## What is here

The JavaScript port, the extraction and verification tooling, the tests and the
documentation. All of it is original work, MIT licensed — see `LICENSE`.

## What is deliberately not here

No ROM image. No disassembly listing. No extracted graphics, level maps,
metasprites, sound data or manifests. No built `dist/`. `.gitignore` enforces
this, and it is checked rather than assumed: `tools/verify_assets.py` and the
`asset-integrity` gate stage both operate on files that only exist after *you*
run the exporter against *your* cartridge.

The same rule is enforced on anything we *publish*, not only on what we commit:
`tools/build-dist.mjs` reads every ROM present and refuses to build a site
containing a file that appears byte-for-byte inside one. It has no allowlist.
The one file that used to be waved through — the player's 6974-byte animation
tile pool, which the port cannot draw without — is now replaced at build time by
original placeholder art of the same size and layout, drawn from scratch by
`tools/make-placeholder-tiles.mjs`. A published build therefore carries derived
tables, and no cartridge pixels.

Everything derived is regenerated locally:

```sh
# your own copy, named exactly:
#   Batman - Return of the Joker (USA, Europe).gb
python tools/export_assets.py
python tools/gen_tunables.py
```

## What this project is, legally speaking

It is a hand translation of a copyrighted game into a different language, in
the same tradition as the various console decompilation projects. That places
it in the same grey area they occupy: the *port* is our own writing, but it was
written by reading Sunsoft's program and it reproduces that program's
behaviour.

We are not lawyers and this is not legal advice. What we can state plainly is
what we have actually done:

- nothing owned by Sunsoft is committed, hosted from this repository, or
  distributed by it;
- the code cannot run without a cartridge image the user supplies;
- no attempt is made to substitute for buying the game, and no ROM source is
  linked.

If you represent a rights holder and want something changed, open an issue or
email the address in the commit history and we will engage in good faith.

## The cartridge this was built against

The No-Intro copy, CRC `5124bbec`, SHA-1
`345a332175f58304f91111a13b770662e5ea92c3`. Other dumps of the same USA/Europe
release should work; the exporter and `tools/gen_tunables.py --check` will tell
you loudly if the bytes are not where they are expected.
