# The NES reference emulator — decision, and how it was measured

**Decision: Mesen 2.1.1, driven headless through its `--testRunner` mode with a
Lua script.** It gives all three capabilities `docs/knowledge/01-the-oracle-method.md`
demands, plus savestates, plus scripted input. Nothing here was taken from a
feature list; every claim below has a command next to it that prints the proof.

PyBoy's `hook_register(bank, addr, cb, ctx)` has an exact NES counterpart:

```lua
emu.addMemoryCallback(fn, emu.callbackType.exec, addr, addr,
                      emu.cpuType.nes, emu.memType.nesMemory)
```

## Install (unattended — no compiler, no admin, no clicking)

```
python games/gradius/tools/oracle/setup_mesen.py
```

Downloads the pinned `Mesen_2.1.1_Windows.zip` (34 MB), checks its SHA-256
against `23ccc2bc060b663c68dad3a8c5d6da7d23a50f872d04f135bafa2b04ff7d5cbe`,
unzips it to `%LOCALAPPDATA%\Mixup\mesen` (override with `MESEN_HOME`) and writes
`settings.json`. Standard library only — no pip install of anything, no wheels,
no build step. Then:

```
python games/gradius/tools/oracle/capability_probe.py --twice
python games/gradius/tools/oracle/input_probe.py
```

### Two settings that are not optional

Both were found by running into them, not by reading docs:

- **`settings.json` must exist before the first run.** Mesen's `Program.Main`
  does `if(!File.Exists(ConfigManager.GetConfigFile())) { …ShowConfigWindow… }` —
  with no config file it opens a **setup wizard window** and waits for a human.
  `setup_mesen.py` writes the file, so that branch is never taken.
- The Python side uses **nothing but the standard library** — verified on
  Python 3.14.0, the newest interpreter on this machine, where a wheel-dependent
  toolchain would have been a problem. There is no `pip install` step at all.
- **`Debug.ScriptWindow.AllowIoOsAccess: true`.** Without it Mesen strips `io`
  and `os` out of the Lua sandbox entirely. Measured: a script asserting
  `type(io)=="table"` exited 20 (nil) before the setting, 27 (io + os + io.open
  all present) after. No `io` means no framebuffer dump.

## What was proven, and what printed it

`capability_probe.py` boots the cartridge, runs 240 frames, hooks the address the
NMI vector points at, samples memory there, dumps the framebuffer, round-trips a
savestate, and prints ~35 fields. Actual output, both runs of `--twice`:

| capability | evidence printed |
|---|---|
| **A** exec hook | `hook.address = $806A` (read out of PRG at `$FFFA` at runtime, not typed in) |
| | `hook.hitCount = 236` over 240 frames — NMI is enabled on frame 4 |
| | `hook.firstHit = frame 4 pc $806A a $00 x $00 y $00 sp $FC ps $44 scanline 241 ppuCycle 25 cpuCycle 86962` |
| | `hook.hit90.zeroPage00_0F = 00 01 59 00 00 00 00 00 00 00 00 00 00 00 2D 00` — RAM read *at the instruction*, and it differs from the same bytes read at end-of-frame (`01 00 EC …`), which is the whole point |
| **B** memory | CPU RAM, OAM, PPU nametable, palette RAM all read: `mem.paletteRam.all32 = 0F 30 30 0F …` |
| | `mem.write.$07F0 = before F0, wrote A5, readback A5, restored F0` |
| | `mem.oamWrite.worked = true` |
| **C** headless | `MainWindowHandle : 0` for the running process — no window is created |
| | `framebuffer.size = 256x240 (61440 pixels)`, `distinctColors = 9`, `nonBlackPixels = 8426`; `out/runA/frame240.png` is the Gradius title screen |
| | savestate: `masterClockAtSave 7144946` → `+60 frames 8931776` → `afterRestore 7144946`, `roundTripExact = true`, `driftWasObservable = true` |
| | **determinism**: run A and run B PPM sha256 both `8b74199b82c394e23d89473a77995ff9a4d975fcfbf9e9e2797f996bac0a4860`, and every one of the ~35 reported fields identical |

`input_probe.py` adds the corpus prerequisite:

```
none  run1/run2  fnv1a=0x173EDDC5  forcedPolls=0   nonBlack=0
start run1/run2  fnv1a=0xE8B1DD3D  forcedPolls=10  nonBlack=1952
```

Holding START for frames 200–209 puts the Vic Viper into stage 1 by frame 400;
without it the screen is black at that frame. Each mode reproduces its own PNG
byte for byte. The two modes differ from each other — so the check is not
vacuous (trap 4.3).

**These checks have been seen to fail.** The first working run reported
`[FAIL] savestate round trip is exact` because the probe compared RAM at the
*next* NMI rather than inside the restoring callback — one frame late. That is
trap #3 (suspect the measurement) reproduced on day one, and the fix is
commented in `capability_probe.lua`.

## Facts about the Mesen Lua API that cost time to learn

Measured against Mesen 2.1.1. All of these are wrong-by-one-argument traps.

| fact | consequence if you get it wrong |
|---|---|
| `emu.read(addr, memType, signed)` — 3 args | — |
| `emu.write(addr, value, memType)` — **3 args, no `signed`** | a 4-arg call throws inside the callback; the script dies silently and the run hangs until `--timeout` and exits `-1` |
| `emu.memType.nesDebug` = CPU space **without** side effects; `nesMemory` **has** them | an oracle read of `$2002`/`$2007` through `nesMemory` changes the run it is measuring |
| `print()` reaches stdout under `--enableStdout`; **`emu.log()` does not** | your diagnostics vanish — `emu.log` targets the script window, which does not exist headless |
| `emu.createSavestate()` / `emu.loadSavestate()` are legal **only inside an exec callback** | another reason capability A is load-bearing, not a nice-to-have |
| Lua is **5.4** — `&`, `~`, `>>` all work | — |
| a Lua error in a callback does not fail loudly | wrap the frame handler in `pcall` and print the error, or a typo costs you a 3-minute hang instead of a message |

## Things Mesen gives us that PyBoy did not

Straight out of `emu.getState()`, which returns ~250 flat keys:

- `ppu.statusFlags.spriteOverflow` and `ppu.secondarySpriteRam0..31` — the
  **sprite-evaluation buffer**, i.e. the 8-sprites-per-scanline result itself.
  `games/gradius/README.md` flags flicker as structural; this is a direct read of
  it rather than an inference.
- `ppu.statusFlags.sprite0Hit` — the status-bar split, findable by hooking the
  polling loop.
- `mapper.chrMemoryOffset0..63` — CHR bank tracking for mapper 3, free.
  Measured at frame 240: `mem.chrBank0Offset = 24576` (bank 3 of 4).
- `masterClock`, `cpu.cycleCount`, `ppu.scanline`, `ppu.cycle` at any hook.
- `emu.getCdlData()` — code/data logger, i.e. which PRG bytes have actually been
  executed. That is disassembly coverage for free.
- `emu.getAccessCounters()`, `emu.takeScreenshot()` (PNG), `emu.step()`.

## Known limits, stated up front

- **Speed is roughly real time.** Measured: 3000 frames in 34–41 s ≈ 80–90 fps
  with a script attached (`--emulation.emulationSpeed=0` helps a little;
  `--novideo --noaudio` does not). A Batman-sized corpus (14,519 frames) would
  be ~3 minutes of emulator time. Savestates are the mitigation — use them for
  per-level setup instead of replaying from boot.
- **One process per scenario.** `--testRunner` loads one ROM, runs one script,
  exits with `emu.stop(n)`. Process startup is ~2 s. Batch scenarios inside a
  single Lua script where possible.
- **The exit code is the only out-of-band channel**, so scripts should print a
  final `PROBE END` line and callers should check for it; a missing `END` means
  the script died mid-callback.
- Mesen's own log noise (`[CPU] Uninitialized memory read: $07F0`) shares stdout.
  `mesen.py` splits it on the `PROBE ` prefix.

## Candidates that were tried and rejected

Both were installed and run against the actual cartridge.

**jsnes 2.1.0** (`npm install jsnes`, no build step). Boots Gradius, deterministic
across runs, and `nes.cpu.mem` is directly readable and writable. It has **no**
hook API (`breakpoint`: 0 occurrences in the bundle) but `cpu.emulate` can be
monkey-patched, and doing so counted **236 executions of `$806A` in 240 frames —
exactly Mesen's number**, so it is not a toy. It is still not the reference:
at frame 240 its framebuffer differs from Mesen's on **8,564 of 61,440 pixels
(13.94%)**. Remapping jsnes's 8 distinct colours onto the Mesen colour each one
most often lines up with — i.e. cancelling out the palette-table difference
entirely — still leaves **181 pixels wrong (0.295%)**, in one 28×24 blob at
x 68–95, y 127–150. That is the ship cursor beside "1 PLAYER": jsnes draws a
sprite there that the cartridge does not, on the **title screen**, the simplest
content in the game. A sprite deviation on frame 240 of a shooter is exactly the
class of error a pixel oracle exists to catch, so jsnes cannot be the pixel
reference. Keep it as a cheap second opinion — it is genuinely useful for
behavioural probes, since it is deterministic and agreed with Mesen on the NMI
count to the frame.

> There is parallel work in `games/gradius/tools/*.mjs` built on jsnes with the
> same `cpu.emulate` monkey-patch. Nothing wrong with that for *behavioural*
> measurement, and it is much faster than Mesen. But any claim it makes about
> **pixels** — sprite flicker, the status-bar split, per-scanline sprite limits —
> should be re-measured against Mesen before it is believed, and the 181-pixel
> title-screen deviation above is the reason.

**nes-py 8.2.1** (`pip install nes-py`, cp312 wheel exists, no compiler needed;
pulls `gym` 0.26.2 which builds from an sdist). Two hard failures:

1. It **refuses this cartridge**: `ValueError: ROM header zero fill bytes are not
   zero.` Gradius has a NES 2.0 header (`4e45531a 02 04 31 08 20 …`); nes-py only
   accepts iNES 1.0 with bytes 8–15 zeroed. Loading it requires editing the
   header, i.e. no longer measuring the real file.
2. With numpy ≥ 2 it then dies with `OverflowError: Python integer 1024 out of
   bounds for uint8` in `_rom.py`. It needs `numpy<2` pinned.

With both worked around it runs, and `env.ram` (2048 bytes) is readable and
writable — but the entire public API is `reset / step / render / close / ram /
screen`. **No execution hooks, no CPU registers, no OAM, no PPU or palette
memory.** Capability A is absent and capability B is a quarter present. Its
frame-240 picture also differs from Mesen's on 13.71% of pixels. Rejected.

**FCEUX** was not pursued: its Lua build on Windows drives a GUI window and has
no documented headless test-runner equivalent, which fails constraint 4 before
accuracy even enters the discussion. If Mesen ever becomes unavailable this is
the first thing to re-measure.

## Files

| file | what it is | committable? |
|---|---|---|
| `setup_mesen.py` | unattended installer + config writer | yes |
| `mesen.py` | headless-run helper every oracle tool imports | yes |
| `capability_probe.lua` / `.py` | the A/B/C proof, `--twice` for determinism | yes |
| `input_probe.lua` / `.py` | scripted input is injectable and reproducible | yes |
| `out/**` | **ROM-derived** framebuffers and reports | **no** — `.gitignore` here covers it |
| `%LOCALAPPDATA%\Mixup\mesen` | the emulator itself, 78 MB | outside the repo on purpose |
