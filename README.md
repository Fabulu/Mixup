# Batman: Return of the Joker — JavaScript port

A hand translation of the Game Boy game (Sunsoft, 1992) from its disassembly
into readable, modifiable JavaScript — **not** an emulator. Every routine
becomes a JS function we own, so the game can be retuned and modded freely.

Verified **bit-exact against the original cartridge**, frame by frame.

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

```sh
python -m http.server 8000     # module imports and fetch need a real server
# then open http://localhost:8000
```

Arrow keys move, `X` jumps, `Z` attacks.

## Layout

| path | what |
|---|---|
| `src/` | the port — player, collision, camera, actors, enemies, renderer, audio |
| `tools/` | ROM extractors, the disassembler, and the verification harness |
| `tools/oracle/` | the PyBoy-based reference oracle (a test tool; it never ships) |
| `tests/` | unit tests, renderer tests, golden frames |
| `docs/` | the master reference and the port/verification plans |

`docs/00-MASTER-REFERENCE.md` is the authoritative technical spec — memory map,
level and metasprite formats, the sound engine, the game state machine.
`docs/03-VERIFICATION.md` explains how fidelity is measured, and carries a
running list of ROM behaviours that are counter-intuitive enough to have caused
real bugs.

## Testing

```sh
npm run test-all              # unit tests + tunables + asset integrity + oracle
npm run test-all -- --fast    # skip the two PyBoy stages
npm test                      # unit tests only
```

The oracle runs the real ROM headless under PyBoy and diffs our state against
it frame by frame. It exists so "faithful" is a checkable property rather than
a vibe — and it has caught a long list of bugs that reading the disassembly did
not, from an unsigned-byte terminal-velocity clamp to Batman being drawn
mirrored for his entire run.

## Status

Player physics, collision (including slopes), camera, wall-cling and wall-jump,
punch, batarangs, scripted door moves, breakables, the HUD and the map-object
array are ported and bit-exact. The enemy array's infrastructure is done and
verified; its 13 AI state handlers are in progress. Audio, the window layer and
the raster effects are still ahead, as is the mod system and its selection
screen.
