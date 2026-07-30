# Mixup

Hand-translating console games from their disassembly into readable, modifiable
JavaScript — **not** emulation. Every ROM routine becomes a JS function you own,
so the game can be read, retuned and modded like any other source code.

## Phase 1 — Batman: Return of the Joker

Game Boy, Sunsoft 1992. **Complete**, and the reason the rest of this exists:
it is where the method was worked out. Everything below describes it.

Verified **bit-exact against the original cartridge**, frame by frame — and in
places pixel by pixel. The game is playable start to finish, title screen to
end credits.

## No ROM in this repository

The cartridge is copyrighted Sunsoft material, so neither it nor anything
derived from it is committed here: no ROM, no disassembly listings, no
extracted graphics, level maps or music. `.gitignore` enforces that.

Everything derived is regenerated from a ROM **you** legally own:

```sh
# put your own copy here, named exactly:
#   Batman - Return of the Joker (USA, Europe).gb
python tools/export_assets.py     # -> assets/   (maps, tiles, metasprites, spawns)
python tools/gen_tunables.py      # -> src/tunables.js  (read from the ROM itself)
python tools/banktrace.py "Batman - Return of the Joker (USA, Europe).gb" --outdir disasm
```

The No-Intro copy this was built against is CRC `5124bbec`, SHA-1
`345a332175f58304f91111a13b770662e5ea92c3`.

## Running it

Export the assets from your own cartridge first (see above), then:

```sh
python -m http.server 8000     # module imports and fetch need a real server
# then open http://localhost:8000
```

Arrow keys or `A`/`D` move, `X` or Space jumps, `Z`/`Y`/`C` attacks, `Up` fires
the bat-rope, `Enter` is START. There are touch controls on phones.

## Layout

| path | what |
|---|---|
| `src/` | the port — player, enemies, collision, actors, doors, the subsystems, both death sequences, every screen, the renderer and the sound driver |
| `tools/` | ROM extractors, the disassembler, the coverage audit and the test runner |
| `tools/oracle/` | the PyBoy-based reference oracle (a test tool; it never ships) |
| `tests/` | unit tests — they run **without** the ROM, on synthetic fixtures |
| `docs/` | the master reference and the port/verification plans |
| `SAVEPOINT.md` | the working map: what is done, what is not, and the traps |

`docs/00-MASTER-REFERENCE.md` is the authoritative technical spec — memory map,
level and metasprite formats, the sound engine, the game state machine.
`docs/03-VERIFICATION.md` explains how fidelity is measured, and carries a
running list of ROM behaviours counter-intuitive enough to have caused real
bugs. Two are worth knowing before reading any of this code:

- **Follow the fall-through, not the label.** A routine that looks like it
  returns often falls straight into the next one. This has cost real work nine
  separate times, once invalidating an already-shipped handler.
- **Byte-exact data is not a correct picture.** A screen can match the
  cartridge's VRAM to the byte and still render wrong, because what is missing
  is not data but whether anything draws it. That is why two gate stages
  compare pixels.

## Testing

```sh
npm run test-all              # all 21 stages
npm run test-all -- --fast    # skip every stage that needs PyBoy
npm run test-all -- --only raster-bands     # one stage
npm test                      # unit tests only
```

23 stages, all green: 687 unit tests, 48 frame-exact input scenarios, and
dedicated oracles for map objects, doors, the per-level subsystems, both death
sequences, the raster program, progress flow, every screen, and all 47 sound
ids. Two of them compare **pixels** rather than memory — added after two real
bugs turned out to be invisible to byte-exact VRAM comparison.

The oracle runs the real ROM headless under PyBoy and diffs our state against
it frame by frame. It exists so "faithful" is a checkable property rather than
a vibe — and it has caught a long list of bugs that reading the disassembly did
not, from an unsigned-byte terminal-velocity clamp to Batman being drawn
mirrored for his entire run.

## Status

**Feature complete.** All fourteen levels are playable, every boss included, and
the game runs from the title screen through to the end credits.

Bit-exact and covered by the gate:

- player physics, collision and slopes, camera, wall-cling and wall-jump,
  the bat-rope, punch and batarangs, and the animation selector
- all 13 enemy AI states, every boss, and the hearts enemies drop
- all 11 map-object types, the door sequencer, breakables and pickups
- the six `sub_00_2CBE` subsystems — conveyors, respawners, the level-11
  entrance freeze, level 12's collapsing floor
- both death sequences at their real length, and the boss-clear fanfare
- all eight arms of the `$0857` raster program — the parallax sky, the water
  band, level 6's track
- the sound driver and DMG APU: **all 47 ROM sound ids**, SFX over live music,
  and the fader, across 52 recordings and 29 800 ticks
- every screen — the SUNSOFT copyright screen, title, press-start flash, round
  select, options and its squash, the stage-intro card, STAGE CLEAR, and the
  ending

**Nothing is captured.** Every screen is BUILT from ROM data and diffed against
the cartridge's own VRAM; the two screen captures this project once carried are
retired and their ripper scripts deleted. `src/` contains no ROM data at all —
every table travels through `assets/manifest.json`, and `tools/verify_assets.py`
re-reads each one from raw file offsets so the exporter cannot verify itself.

Known remaining gaps, all small and all documented in `SAVEPOINT.md`: a 2–3 px
sprite bob on four levels (`sub_00_0F56`), the melee hit-spark effect, the OAM
ordering of the GAME OVER lettering's own burst (the HUD half of that
alternation is ported), and coverage — not code — for level 6's alternate
tile-animation table, which is in fact the DOMINANT arm once the player moves
(measured: 732 of 800 frames), not the unreachable one this sentence used to
claim. One deliberate deviation is documented
in `drawWindow`: the water's 50% dither is reproduced spatially rather than as
the hardware's 30 Hz alternation, because on a modern display that is a
photosensitivity hazard rather than the translucency a DMG's slow LCD made of
it.

`tools/audit_coverage.py` answers "what have we missed?" with a number — it
cross-references every routine the disassembler finds an xref to against every
address the port cites. It currently reports **no region of the ROM the port
has never touched**.

## Contributing

`CONTRIBUTING.md` has the rules that actually matter. The short version:
**measure it against the cartridge, or don't change it.** There is a correct
answer to every question in this repository and it is available — a PyBoy
oracle runs the real ROM and diffs our state against it — so "I think it works
like this" is never the standard.

Two habits that are not optional:

- **Cite the ROM address** on every non-obvious line. It is how the next person
  checks your work without re-deriving it.
- **A new check must be seen to fail.** Revert the fix, watch it go red,
  restore. Two checks here sat green through the bug they were written for.

## Licence

MIT — see `LICENSE`. That covers this repository's own work: the port, the
tooling, the tests and the docs.

It grants nothing over *Batman: Return of the Joker*, which remains Sunsoft's.
No ROM, listing or extracted asset is distributed here, and nothing runs without
a cartridge image you supply yourself. `NOTICE.md` sets out exactly what is and
is not included, and what this project is legally.
