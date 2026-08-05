# RESEARCH-B - ROM → NATIVE/JS PORTING: PRIOR ART & METHODOLOGY

Scope: what existing work we can *reuse* instead of inventing, for translating
*Batman: Return of the Joker* (GB, Sunsoft 1992, MBC1, 128 KB) from disassembly
into readable, modifiable JavaScript. Companion to `01-PORT-PLAN.md`.

Every claim is tagged **[V]** = verified (I fetched the page / official docs) or
**[I]** = inferred (search-result summary or reasoning, not directly confirmed).

---

## 0. BOTTOM LINE

1. **A Game Boy static recompiler DOES exist and is real** - `gb-recompiled`
   (LR35902 → C). It is *not* the right tool for us, because its output is
   machine-generated register-shuffling C (4.2 M lines for one GB game), which
   is the exact opposite of "every routine is a JS function we can modify".
   **We do not use it as a translator. We may mine it for two things:** its
   jump-table solver technique, and its validation workflow.
2. **We can get a reference oracle essentially for free, today, with PyBoy**
   (pip-installable Python GB emulator with byte-level memory access, ROM-address
   execution hooks, savestates, deterministic headless ticking). This removes the
   entire "build our own emulator oracle" work item. **This is the single highest-
   value finding in this document.** See §2.
3. The dominant methodology across every successful decomp→port project is the
   same three-phase shape: **(a) mechanical/matching translation → (b) incremental
   substitution with the original still running as the fallback → (c) readability
   refactor only behind a passing differential test.** Projects that skipped (b)
   or refactored before (c) had a bad time.

---

## 1. STATIC RECOMPILATION - WHAT EXISTS

### 1.1 Game Boy: `gb-recompiled` **[V]**

- Repos: `github.com/arcanite24/gb-recompiled` (upstream) and
  `github.com/sp00nznet/gb-recompiled` (the more advanced fork). MIT licensed.
- Pipeline: **ROM → Decoder → IR Builder → Analyzer → C Emitter**. Each ROM bank
  becomes a separate `.c` file; code blocks become named C functions.
- It tracks 8-bit register and 16-bit pair contents through the CFG, resolves
  constant pointers loaded into `HL`/`DE`, and *scans backwards for jump-table
  patterns* to discover branch targets. Claims **>98% code discovery** on complex
  ROMs without dynamic traces. **[V]**
- Claimed compatibility: recompiles **1592/1609 ROMs (98.9%)** - but the authors
  explicitly state *recompilation success ≠ playability*. Only ~7 titles are
  validated playable (Tetris, Pokémon Blue, DK Land, Kirby's Dream Land, Link's
  Awakening, Castlevania, Super Mario Land). **[V]**
- Output style, from the README's own example:
  ```c
  ctx->a = gb_read8(ctx, ctx->hl++);
  gb_add8(ctx, ctx->b);
  ```
  i.e. a `ctx` struct holding CPU registers, with every instruction emitted
  one-to-one. Control flow becomes `if` + function calls. **[V]**
- **Not** supported: RAM-executed code, self-modifying code. Unresolved indirect
  jumps fall back to **a small embedded interpreter**. **[V]**
- Downstream showcase: `github.com/sp00nznet/LinksAwakening` - full static
  recompilation of *Link's Awakening DX* to a native Windows app,
  **~4.2 million lines / ~115 MB of generated C**, playable start to finish,
  with a full scanline PPU, 4-channel APU at 44.1 kHz, CGB banking/HDMA/double-
  speed in the runtime `libgbrt`. **[V]**

**Verdict for us: reject as a translator, mine as a reference.**
Reasons: (a) it still ships a PPU + APU + timing emulator as `libgbrt`, which is
exactly the "emulator" the user rejected; (b) 4.2 M lines of `ctx->a = ...` is
not modifiable game code - you cannot "change the jump height" in it; (c) it
targets C/SDL2, not JS. What it *does* prove: our ROM's indirect jumps
(`JP HL`, jump tables) are tractable by static analysis, and a backwards
jump-table scan is a known-good technique if we hit an unresolved dispatch.

### 1.2 N64Recomp / Zelda64Recomp **[V]**

- `N64Recomp` takes **a binary + a symbol/metadata list**, splits the binary into
  functions, and emits **one C function per original function**, named from the
  metadata. Instructions are processed one-by-one, emitting C as it goes. Output
  compiles under MSVC/GCC/Clang. Runtime hardware abstraction lives in a separate
  library (`N64ModernRuntime`).
- The architecturally important idea, and the one that transfers directly:
  **the recompiler is driven by an external symbol/function-boundary list, not by
  its own guesses.** Our `docs/00-MASTER-REFERENCE.md` *is* that list. We already
  have what N64Recomp demands as input.
- **Transferable lesson:** function boundaries + names are the contract. Keep a
  machine-readable manifest of `bank:address → jsFunctionName` and generate the
  skeleton/stubs from it, so nothing gets silently forgotten. RGBDS `.sym` format
  is the natural carrier (see §2.4).

### 1.3 Other platforms **[I]**

- NES/SNES/Genesis static recompilers exist mostly as academic or abandoned
  one-offs; nothing with the maturity of N64Recomp surfaced. `jitboy`
  (`sysprog21/jitboy`) is a **dynamic** recompiler (JIT) for GB, not static - it
  is an emulator with a fast core, irrelevant to us.
- There is no SM83 → JavaScript recompiler of any maturity. **[I, searched]**

---

## 2. THE REFERENCE ORACLE - CHEAPEST PATH (HIGHEST-VALUE SECTION)

We deferred building our own emulator oracle. **We should never build one.**
Off-the-shelf tooling gives us a better oracle than we would write.

Ranked recommendation: **PyBoy (primary) → BizHawk Lua (secondary/TAS) →
mGBA Lua (tertiary) → Emulicious/BGB (interactive debugging only)**.

### 2.1 PyBoy - THE RECOMMENDATION **[V]**

`pip install pyboy`. Pure-Python API (Cython core), MIT-ish, actively maintained,
explicitly designed for "high-speed, **deterministic** emulation for AI/ML
training, bot development with direct memory access". Verified API from
`pyboy/pyboy.py`:

```python
PyBoy(gamerom, *, ram_file=None, rtc_file=None, window="SDL2", scale=3,
      symbols=None, bootrom=None, sound_volume=100, sound_emulated=True,
      cgb=None, no_input=False, log_level="WARNING", ...)
```

Everything we need, all verified:

| Need | API | Notes |
|---|---|---|
| Headless, no window | `window="null"` | merged old "headless"/"dummy" modes |
| Max speed | `pyboy.set_emulation_speed(0)` | unlimited |
| Advance exactly N frames | `pyboy.tick(count=1, render=True, sound=True) -> bool` | returns `False` when emulation ends; `render=False` skips the PPU for speed |
| **Read a RAM range** | `pyboy.memory[0xC000:0xE000]` → `list[int]` | slice read, this is the oracle primitive |
| Single byte | `pyboy.memory[0xFFB1]` | |
| **Banked read** | `pyboy.memory[bank, addr]`, `pyboy.memory[bank, start:stop]` | bank 0 = ROM0/ROM1 window, bank N = ROM bank N, bank −1 = boot ROM; WRAM banks 0–7 / VRAM 0–1 in CGB |
| Inject input | `pyboy.button("a")`, `button_press`/`button_release`, `send_input(event, delay=0)` | `button()` auto-releases at the next `tick` |
| Savestate | `pyboy.save_state(file_obj)` / `pyboy.load_state(file_obj)` | file-like objects → we can keep them in memory |
| **Hook a ROM address** | `pyboy.hook_register(bank, addr, callback, context)` / `hook_deregister(bank, addr)` | fires when the CPU executes that address |
| **Hook by symbol name** | pass `symbols="game.sym"` to the ctor, then `hook_register(None, "SymbolName", cb, ctx)` | |
| Framebuffer | `pyboy.screen` (`.image` PIL, `.ndarray`) | for golden-frame hashing |
| Record/replay input | `record_input=True` plugin → `.replay` file: **zlib-compressed JSON** of frame numbers, key events, and base64 RGB frames | recommend loading a savestate at boot so it embeds in the replay |

**Why `hook_register` is the killer feature.** It upgrades us from *frame-level*
diffing to **function-level differential testing**. We can hook the entry address
of every routine in the master reference, snapshot the machine state at that
instant, and compare it against the state our JS function saw - so when a
divergence appears we know *which ROM routine* first misbehaved, not just "frame
900 is wrong". Nothing else in this document is worth as much as that.

#### 2.1.1 Concrete oracle script - per-frame RAM trace

```python
# tools/oracle_trace.py - writes one binary record per frame
import hashlib, struct, zlib
from pyboy import PyBoy

ROM = "batman.gb"
RANGES = [(0xC000, 0xE000), (0xFE00, 0xFEA0), (0xFF80, 0xFFFF)]  # WRAM, OAM, HRAM

pyboy = PyBoy(ROM, window="null", sound_emulated=False, log_level="ERROR")
pyboy.set_emulation_speed(0)

# deterministic input script: {frame: (["a"], ["start"])} = press, release
INPUTS = {60: (["start"], []), 64: ([], ["start"]), 300: (["right"], [])}

out = open("trace.bin", "wb")
for frame in range(0, 60 * 60):          # 60 seconds
    press, release = INPUTS.get(frame, ([], []))
    for b in press:   pyboy.button_press(b)
    for b in release: pyboy.button_release(b)

    if not pyboy.tick(1, False):          # render=False → much faster
        break

    blob = bytearray()
    for lo, hi in RANGES:
        blob += bytes(pyboy.memory[lo:hi])
    out.write(struct.pack("<IH", frame, len(blob)) + hashlib.sha1(blob).digest())
    out.write(zlib.compress(bytes(blob), 1))   # full state, cheap to store
out.close()
pyboy.stop()
```

Run our JS port under Node with the identical input script, serialise the same
three ranges from `GameState` through the same layout, and diff. First differing
frame + first differing address = the bug, localised to one routine via the RAM
map in `docs/recon-2-ram-map.md`.

#### 2.1.2 Concrete oracle script - function-level I/O capture

```python
# tools/oracle_functions.py - capture inputs/outputs of one ROM routine
from pyboy import PyBoy
import json

pyboy = PyBoy("batman.gb", window="null", sound_emulated=False)
pyboy.set_emulation_speed(0)
samples = []

def snapshot():
    return {
        "player": list(pyboy.memory[0xC700:0xC768]),   # player + gameflow block
        "hram":   list(pyboy.memory[0xFF80:0xFFFF]),
    }

pending = {}
def on_enter(ctx):                       # e.g. player update at 00:1600
    pending["in"] = snapshot()
def on_exit(ctx):                        # the routine's RET address
    samples.append({"in": pending.get("in"), "out": snapshot()})

pyboy.hook_register(0, 0x1600, on_enter, None)   # bank 0, $1600
pyboy.hook_register(0, 0x20B9, on_exit,  None)   # bank 0, exit/RET site

for _ in range(60 * 120):
    if not pyboy.tick(1, False): break
json.dump(samples, open("player_update_cases.json", "w"))
pyboy.stop()
```

This gives us **generated unit-test fixtures for individual ported functions**:
thousands of real (pre-state → post-state) pairs harvested from actual gameplay.
Port `playerUpdate()`, replay the fixtures, assert byte-equality on the state
block. That is how we prove `player.js` before the renderer even exists.

> Accuracy caveat **[I]**: PyBoy is a *good* but not cycle-perfect emulator.
> For **game-logic RAM state** (what we actually port), it is more than adequate.
> For anything that depends on sub-scanline PPU/STAT timing - and this game has a
> STAT raster program at `00:0857` - do not treat PyBoy as authority; cross-check
> against BizHawk/SameBoy or Emulicious. Our port replaces the raster program with
> a compositor anyway, so this is a low-risk area.

### 2.2 BizHawk - the TAS-grade secondary oracle **[V]**

Full Lua 5.4 with the standard `io` library (so it can write files directly,
unlike mGBA), TASVideos-grade determinism, and a real movie format.

Verified Lua API (`tasvideos.org/Bizhawk/LuaFunctions`):

```lua
memory.readbyte(addr, [domain])
memory.read_bytes_as_array(addr, length, [domain])        -- 1-indexed table
memory.read_bytes_as_binary_string(addr, length, [domain]) -- best for dumping
memory.usememorydomain(domain)
mainmemory.read_bytes_as_binary_string(addr, length)
savestate.save(path) / savestate.load(path)
event.onframestart(fn, [name])  /  event.onframeend(fn, [name])
event.on_bus_read(fn, [addr], [name], [scope])   -- cb(addr, val, flags)
event.on_bus_write(fn, [addr], [name], [scope])
event.on_bus_exec(fn, addr, [name], [scope])     -- execution hook, like PyBoy's
movie.play_from_start([path]) / movie.getinput(frame) / movie.length()
client.frameadvance()   -- MUST be called in loops or EmuHawk hangs
```

Per-frame dump, minimal:

```lua
local f = assert(io.open("trace.bin", "wb"))
event.onframeend(function()
  f:write(memory.read_bytes_as_binary_string(0xC000, 0x2000, "System Bus"))
  f:write(memory.read_bytes_as_binary_string(0xFF80, 0x007F, "System Bus"))
end)
while true do emu.frameadvance() end
```

BizHawk also has `event.on_bus_exec` - the same function-entry hook trick as
PyBoy, if we want a second opinion on a specific routine.

**Use BizHawk when:** we need a TAS-quality deterministic movie (`.bk2`), or we
suspect PyBoy inaccuracy. **Use PyBoy for the daily loop** - it scripts in-process,
runs unattended in CI, and needs no GUI.

### 2.3 mGBA Lua - capable but awkward for our use **[V]**

mGBA 0.10+ ships Lua scripting and **does support the Game Boy platform**.
Verified from `mgba.io/docs/scripting.html`:

```lua
emu:read8(address)  emu:read16(address)  emu:read32(address)
emu:readRange(address, length) -> string      -- bulk read, exactly what we want
emu.memory.<domain>:readRange(addr, len)      -- also base()/bound()/size()/name()
callbacks:add('frame', fn)                    -- also keysRead, reset, start/stop
emu:setKeys(mask) / emu:addKeys / emu:clearKeys / emu:getKeys   -- C.GB_KEY.*
emu:saveStateFile(path, flags) / emu:loadStateFile(path, flags)
emu:saveStateBuffer(flags) -> string
emu:runFrame()   emu:step()
emu:platform() -> C.PLATFORM.GB
```
**GB memory domains: `cart0`, `vram`, `sram`, `wram`, `oam`, `io`, `hram`.** **[V]**

**Two blockers [V]:**
1. The Lua sandbox **does not expose the standard `io` library.** You get a
   `storage` bucket API (periodically flushed to disk) and a **TCP socket
   library** (`socket.connect/bind/tcp`, with `received`/`error` callbacks).
   So dumping a trace means either streaming it over a socket to a listener, or
   abusing storage buckets. Workable, but strictly more plumbing than PyBoy/BizHawk.
2. **The scripting engine is not available in `mgba-rom-test`**, mGBA's headless
   binary. Headless scripted runs need `mgba-qt` under `xvfb`. **[I, from search]**

Use mGBA only if we specifically want its GB core as a third opinion.

### 2.4 Emulicious / BGB / SameBoy **[I]**

- **Emulicious** has an excellent debugger, trace logging with per-instruction
  expression evaluation, a memory tracer, and VS Code integration - but no
  general scripting API surfaced. Best for *interactive* investigation of a
  specific routine, not for automated trace generation.
- **BGB** likewise: superb debugger, no scripting API.
- **SameBoy** is the accuracy gold standard and is what `gb-recompiled` used as
  its *reference emulator*, with a "SameBoy reference tracer + comparator" in its
  debug tools **[V, from the LinksAwakening README]**. It has a debugger console
  that accepts command scripts but no Lua/Python binding. Note BizHawk has an
  open issue about adopting SameBoy as its GB/GBC core **[I]** - worth checking
  whether current BizHawk already ships it, which would give us SameBoy accuracy
  *plus* Lua in one tool.
- **All of these accept RGBDS `.sym` files** (`rgbds.gbdev.io/sym`), the same
  format PyBoy's `symbols=` kwarg wants and the same format `pret`'s
  disassemblies emit. **Emit a `.sym` from our disassembly and every tool in this
  document becomes symbol-aware for free.** This is a ~1-hour task with an
  outsized payoff.

---

## 3. TAS / DETERMINISTIC INPUT REPLAY

We need one canonical input-script format that both an emulator and our JS port
can consume.

- **BizHawk `.bk2`** **[V]**: a **ZIP archive**. Contains `Header` (author,
  emulator version, platform, game name, core, **game hash**), `Input Log`,
  `Comments`, `Subtitles`, **`SyncSettings`** (core settings required for
  deterministic playback), and `CoreState` if the movie starts from a savestate.
  The Input Log is **UTF-8 text**; each frame is a line starting with `|`;
  boolean buttons are one character when pressed and `.` when not; analog is a
  5-digit space-padded number followed by a comma. **This is trivially parseable
  - a 30-line JS reader.** Movies depend on deterministic playback by design.
- **PyBoy `.replay`** **[V]**: zlib-compressed JSON with frame numbers, key
  events, and base64 160×144 RGB frames. Self-contained (frames included!), so
  it doubles as a golden-frame reference. Recommendation from the docs: start
  from a savestate embedded in the replay for reproducibility.
- **Recommendation:** define our own trivial canonical format -
  `[{frame:int, press:[...], release:[...]}]` JSON - and write two 30-line
  converters (`.bk2 → ours`, `ours → PyBoy button calls`). Do **not** adopt a
  vendor format as the source of truth; the Input Log semantics of `.bk2` are the
  only part we need, and both directions are a day's work at most.

---

## 4. HAND-DECOMPILATION PROJECTS THAT SHIPPED PLAYABLE PORTS

### 4.1 OpenRCT2 - **the closest methodological analogue to our project** **[V]**

RollerCoaster Tycoon 2 was 100% hand-written x86 assembly. The port strategy:

- `rct2.exe` was **patched so that `openrct2.dll` and `WinMain` are in its import
  table**. The DLL could read/write the original's memory model and *call original
  procedures*.
- OpenRCT2 **called into the original `RCT2.EXE` for every function it did not yet
  have**, replacing them **one at a time**. It had to remain a DLL called from the
  patched exe until all procedures were rewritten.
- That process ran from ~2014 to **15 October 2015**, when the game finally became
  independent (except for graphics/sound/object assets).

**Why this matters to us:** they were *playable at every commit*. There was never
a "big bang" integration. The bisect granularity was one function.

**Our equivalent - and this is the concrete recommendation:** a **hybrid harness**
where PyBoy runs the real ROM as the "original binary", and a per-routine switch
decides whether frame N's `playerUpdate` comes from the ROM or from our JS. Using
`hook_register` on a routine's entry, we can (a) run the ROM routine, snapshot the
state delta, (b) run our JS routine on the same input state, (c) assert equality,
and (d) if it passes, flip that routine's switch permanently. The routine list in
`01-PORT-PLAN.md` becomes a burndown chart with a machine-checked definition of
"done". *(Note: we cannot literally write our JS results back into PyBoy's RAM to
let the ROM continue from our state without extra work - PyBoy exposes memory
writes, so it is feasible, but the honest cheap version is (a)–(c) as a
*shadow/comparison* harness rather than true substitution. **[I]**)*

### 4.2 Devilution / devilutionX (Diablo) - function-level binary matching **[V]**

- `diasurgical/devilution-comparer`: given a function, it **disassembles that
  function from the devilution build, then disassembles the original binary at the
  same offset for the same length**, writing `orig.asm` and `compare.asm` for
  side-by-side diffing. It uses the function offset from the PDB for both, so
  addresses and relative jumps line up.
- They had a huge advantage: **debug symbols (`SYM` info) shipped in some Diablo
  builds**, plus a debug build hidden in `DIABDAT.MPQ` with assert strings. They
  used the original names.
- Method: work function by function, diff, refine C until the assembly matches,
  move on. `devilutionX` then forked the matching source into a portable,
  refactored, feature-added game.

**Transferable:** (1) the split between "matching artifact" (devilution) and
"playable modern port" (devilutionX) as **two separate repos/branches** -
refactoring never endangers the proof of correctness; (2) invest in the comparer
tool early, it is the throughput bottleneck.

### 4.3 Super Mario 64 → sm64ex / sm64-port **[I/V mixed]**

- Started ~2018, driven by speedrunners wanting *understanding*, not a port;
  reached full matching after ~2 years of volunteer work. **[I]**
- **The key structural insight:** the targeted US build was compiled **without
  optimisation**, so the C↔MIPS relationship was nearly one-to-one and matching
  was tractable. Optimised builds (OoT) turned matching into trial-and-error
  puzzle solving. **[I]**
- Once matching source existed, PC ports (`sm64-port`, `sm64ex`) appeared
  *quickly* - the hard part was the decomp, the port was comparatively cheap.

**Transferable, and directly relevant:** our source is **hand-written assembly**,
which is the *good* case - there is no compiler between us and the intent, so
every routine has a direct, readable JS shape. But there is also **no "correct"
answer to converge on**: a matching decomp has byte-equality of the rebuilt ROM as
its oracle; we have thrown that away by targeting JS. **We must replace ROM-
byte-equality with state-trace equality (§2), or we have no oracle at all.** This
is the single biggest risk in the project and the reason §2 matters so much.

### 4.4 Ship of Harkinian (OoT) - the asset/code split **[V]**

- Built on the ZRET decomp (21 months to human-readable, recompilable C).
- The port sits on **`libultraship`**, a reimplementation of the N64 `libultra`
  SDK API surface on modern hardware. Game code was left as close to the decomp
  as possible; the *platform layer* absorbed the change.
- **Assets are extracted from a user-supplied legal ROM at runtime** into a `.o2r`
  archive; no copyrighted data ships.

**Transferable:** (1) build a **thin compatibility shim** that mirrors the shape of
the original hardware API (our `render/`, `sound/`, `input.js` are exactly this)
so game code needs minimal edits - this is what `01-PORT-PLAN.md` already does;
(2) **ship an extractor, not assets** - this is both the legally safe posture and
the one every major project converged on independently.

### 4.5 Another World / "Fabother World" - the architecture-discovery win **[V]**

Fabien Sanglard spent ~2 weeks reverse-engineering the DOS binary (building on
Gregory Montoir's binary→C++ work) and found the game was **a bytecode VM**: all
game logic in custom opcodes, with syscalls out to draw/sound/asset routines. The
20 KB executable was just the VM; porting to a dozen platforms meant reimplementing
only the VM, with the bytecode untouched.

**Transferable, and we should act on it:** *find our project's VM before writing a
line of code.* We already have two: the **VRAM script interpreter** at `00:0A0E`
and the **56-opcode sound sequencer** in bank 7. For those two, do **not** port the
data - port the interpreter and keep the original byte streams as data assets.
That is dramatically less code, dramatically less risk, and automatically correct
for every menu/cutscene/song. `01-PORT-PLAN.md` already has this right; this is
independent confirmation that it is the correct call.

### 4.6 Chocolate Doom - the regression harness to copy **[V]**

Chocolate Doom's fidelity claim rests on **`statcheck`**: a Python script that runs
the engine over **all the demos in the Compet-N archive** and checks the output
matches expectations. It uses thousands of recorded demos as desync regression
tests.

**Honest limitation they document themselves:** `statdump` only captures
*intermission-screen statistics*, so **a match does not prove no desync - only a
mismatch proves one.** They accepted a coarse-but-cheap signal over a perfect,
expensive one, and it worked.

**Transferable, and this is the model for our CI:** a corpus of recorded input
scripts (§3) + a cheap per-frame state hash. We get a *far better* signal than
Chocolate Doom did, because our hash can cover all of WRAM/HRAM/OAM, not just an
end-of-level summary. Build the corpus early - every playtest session should be
recorded and promoted into the regression set.

### 4.7 Others, briefly **[I]**

- **Cave Story / NXEngine**: reimplementation from reverse-engineering rather than
  decomp; verified by eye. Lesson is mostly negative - no systematic oracle meant
  long-tail behavioural bugs surfaced for years.
- **Sonic (Retro Engine / RSDK)**: Christian Whitehead's engine was a
  *reimplementation from observation*, not a decomp, and its fidelity came from
  obsessive frame-by-frame comparison against the original. Same lesson.
- **`pret` disassemblies (pokered etc.)**: the notable thing is they stop at a
  matching ROM build; the ecosystem's mods are *ROM hacks*, not ports. Their
  reusable artifact for us is the **build emitting `.sym` and `.map` alongside the
  ROM**, with tooling reading `.sym` to map labels to offsets. Copy that.
- **Link's Awakening DX HD**: a ~100 kLOC C#/MonoGame **from-scratch
  reimplementation**, *not* based on the decomp. It got a DMCA takedown from
  Nintendo **[V]**. Two lessons: a full hand-reimplementation of a GB action-
  adventure is roughly 100 kLOC of work, and distribution posture matters (ship
  code + extractor, never assets - see §4.4).

---

## 5. VERIFICATION TECHNIQUE CATALOGUE

Ranked by cost/benefit for us:

| Technique | Cost | Signal | Verdict |
|---|---|---|---|
| **Per-frame state-vector hash** (WRAM+HRAM+OAM sha1) vs PyBoy trace | Low | Very high; pinpoints first divergent frame | **Adopt as the primary oracle** |
| **Function I/O fixtures** via `hook_register` (§2.1.2) | Low | Highest; pinpoints the divergent *routine* | **Adopt - do this first, before frame diffing** |
| **Deterministic input replay** (own JSON format, §3) | Low | Prerequisite for everything above | **Adopt** |
| **Golden-frame hashing** (framebuffer PNG/hash per N frames) | Medium | Catches renderer bugs the RAM diff can't | Adopt *later*, once the compositor is real; expect legitimate divergence since we replace the raster program |
| **Full state-vector diff** (not just hash) stored compressed | Medium | Tells you *which byte* diverged → which variable | Adopt; storage is cheap (§2.1.1 stores it) |
| **Reference-emulator instruction tracer + comparator** (SameBoy, as gb-recompiled did) | High | Instruction-exact | Skip - we are not producing instruction-exact code |
| **ROM byte-equality** (the `pret`/sm64 standard) | N/A | Perfect | **Unavailable to us by construction.** Named here so nobody proposes it later. |

**Sequencing recommendation:** function fixtures → per-frame RAM hash → per-frame
full state diff → golden frames. Each layer only gets built when the one before it
starts producing false negatives.

**Divergence-tolerance policy - decide this before writing the harness.** Three
categories, and they need different rules:
1. **Must match exactly**: player/enemy/actor state, collision results, RNG,
   score/HP, gameflow variables.
2. **Allowed to diverge**: anything downstream of the STAT raster program, VRAM
   contents (we composite differently), OAM ordering *if* our renderer sorts
   differently - though `01-PORT-PLAN.md` correctly preserves main-loop call order
   precisely to keep OAM ordering identical, so prefer keeping this in category 1.
3. **Will diverge and that's the point**: everything a mod touches. The harness
   must run against a **"vanilla" mod profile** with all tunables at ROM defaults;
   modded profiles are never diffed.

---

## 6. FIXED-POINT vs FLOAT

Findings are thin on published post-mortems, but the consensus is unambiguous and
matches what `01-PORT-PLAN.md` already decided. **[I, with one caveat below]**

- **Determinism**: if determinism matters, fixed-point is mandatory; float is the
  standard source of cross-platform divergence.
- **Sub-pixel movement is a *feature*, not an artifact**: the 8.8/12.4 fractional
  part is what produces the characteristic acceleration/gravity feel. Reproducing
  the *integer* pixel positions per frame requires reproducing the fractional
  accumulator exactly.
- **Fixed-point is nearly free in JS**: it is integer arithmetic. With `|0`,
  `& 0xFF`, `& 0xFFFF`, and `Math.imul` where needed, SM83 8/16-bit semantics
  (including wraparound, which the original *relies* on) map directly.

**The JS-specific trap, and the one thing to get right:** JS numbers are doubles,
so **overflow does not wrap**. Every ported arithmetic op that the original allowed
to wrap must be explicitly masked. Recommendation: never write raw `+`/`-` on state
fields; funnel everything through helpers.

```js
const u8  = v => v & 0xFF;
const s8  = v => (v << 24) >> 24;
const u16 = v => v & 0xFFFF;
const s16 = v => (v << 16) >> 16;
const add8c = (a, b) => { const r = a + b; return { v: r & 0xFF, c: r > 0xFF }; };
```

Store all fixed-point fields as plain integers in their original scale (12.4 for
positions, per the master reference) and convert to pixels **only at the last
moment inside the renderer**. Never let a fixed-point value become a float, not
even transiently - one `/ 16` in the physics path silently destroys reproducibility
and the state diff will catch it 400 frames later in a confusing place.

`01-PORT-PLAN.md` §b already commits to signed 16-bit 12.4 for position and 8-bit
velocity semantics. **This is correct; no change recommended.** The addition is:
*enforce it with masking helpers, and add a CI lint that flags `/`, `*`, `Math.` in
the physics/collision modules.*

---

## 7. HAND-WRITTEN JS PORTS OF GAME BOY GAMES - PRIOR ART IS ESSENTIALLY EMPTY

Searched multiple phrasings. **[V, negative result]**

- Everything that surfaces under "Game Boy game in JavaScript" is an **emulator**
  (Imran Nazar's 8-part series, gbajs2, Boyo, jsGB, etc.).
- The nearest thing is `tcraven/zelda-game`, a JS demo "based on Link's Awakening"
  - a fan recreation from observation, not a translation from disassembly, with no
  writeup.
- **There is no published "I rewrote a Game Boy game in JavaScript from its
  disassembly" writeup.** No methodology to borrow, and no cautionary tale either.

Two consequences: (1) all methodology has to be imported from the C-targeting
projects in §4, which is what this document does; (2) **this project is novel
enough to be worth writing up**, and the writeup is close to free if we keep the
`docs/` discipline we already have.

---

## 8. RECOMMENDED ADOPTIONS - CONCRETE, ORDERED

1. **Emit an RGBDS `.sym` file from the disassembly.** ~1 hour. Unlocks
   symbol-aware hooking in PyBoy (`symbols=`), Emulicious, BGB, and BizHawk.
   Format spec: `rgbds.gbdev.io/sym`.
2. **`pip install pyboy`; build `tools/oracle_trace.py` (§2.1.1) and
   `tools/oracle_functions.py` (§2.1.2).** Half a day. This is the deferred
   "emulator oracle" work item, closed for a fraction of the estimated cost.
3. **Define the canonical input-script JSON (§3)** and write the PyBoy driver +
   the JS driver against it. Add a `.bk2` importer only if we want TAS corpora.
4. **Adopt the OpenRCT2 shadow-harness pattern (§4.1):** every ported routine is
   "done" only when its generated fixtures pass. Turn `01-PORT-PLAN.md`'s module
   table into a machine-readable manifest with a per-routine status field.
5. **Adopt the devilution two-artifact split (§4.2):** mechanical translation
   first, readability refactor *only* behind a passing diff, and keep the
   mechanical version reachable in git history so a regression can be bisected
   against it. `01-PORT-PLAN.md` porting-style rule #1 already says this - hold
   the line on it.
6. **Port the two interpreters, not their data (§4.5):** VRAM script `00:0A0E`
   and the bank-7 sequencer. Keep byte streams as assets.
7. **Start the regression corpus now (§4.6).** Every recorded play session becomes
   a permanent test. This compounds; starting late wastes it.
8. **Fixed-point masking helpers + a physics-module lint (§6).**

---

## 9. RISKS THIS RESEARCH SURFACED

- **We have no byte-equality oracle by construction.** The state-trace oracle is a
  full replacement, not a nice-to-have. If §8 items 2–3 slip, the project has no
  definition of "correct" and will accrue silent behavioural drift. Do them first.
- **PyBoy accuracy on STAT/PPU timing is unverified by me.** Low practical risk
  (we replace the raster program), but do not use PyBoy to adjudicate a
  raster-timing question - use SameBoy or Emulicious.
- **Mods and the oracle are in tension.** The harness must run a locked "vanilla"
  tunables profile, or the diff becomes noise. Bake this into `mods.js` from day
  one rather than retrofitting it.
- **RNG.** `01-PORT-PLAN.md` mentions an "RNG substitute". A *substitute* RNG makes
  the state trace diverge immediately and permanently. **Port the original RNG
  bit-exactly** and keep any substitute as a mod-only option.
- **Legal/distribution.** Every project in §4 that shipped assets got taken down
  (LADX HD) and every one that shipped code + an extractor survived (SoH,
  devilutionX, OpenRCT2, gb-recompiled - the last of which even gitignores its own
  generated `rom.c`). Ship the extractor; never the extracted assets.

---

## 10. SOURCES

**Fetched directly (VERIFIED):**
- mGBA Scripting API - https://mgba.io/docs/scripting.html
- mGBA Scripting API (dev) - https://mgba.io/docs/dev/scripting.html
- BizHawk Lua Functions - https://tasvideos.org/Bizhawk/LuaFunctions
- PyBoy source `pyboy/pyboy.py` - https://github.com/Baekalfen/PyBoy/blob/master/pyboy/pyboy.py
- gb-recompiled (upstream) - https://github.com/arcanite24/gb-recompiled
- gb-recompiled (fork) - https://github.com/sp00nznet/gb-recompiled
- LinksAwakening static recomp - https://github.com/sp00nznet/LinksAwakening

**Search-result summaries (INFERRED - not individually fetched):**
- N64Recomp - https://github.com/N64Recomp/N64Recomp
- Zelda64Recomp - https://github.com/Zelda64Recomp/Zelda64Recomp
- BizHawk BK2 format - https://tasvideos.org/Bizhawk/BK2Format
- OpenRCT2 (Wikipedia / RCT wiki) - https://en.wikipedia.org/wiki/OpenRCT2
- devilution-comparer - https://github.com/diasurgical/devilution-comparer
- devilution CONTRIBUTING - https://github.com/diasurgical/devilution/blob/master/docs/CONTRIBUTING.md
- Ship of Harkinian / Shipwright - https://github.com/HarbourMasters/Shipwright
- Chocolate Doom statcheck - https://www.chocolate-doom.org/wiki/index.php?title=Statcheck
- Another World code review - https://fabiensanglard.net/anotherWorld_code_review/
- RGBDS .sym spec - https://rgbds.gbdev.io/sym
- pokered build system - https://github.com/pret/pokered
- PyBoy record_replay plugin - https://docs.pyboy.dk/plugins/index.html
- Emulicious debugger - https://emulicious.net/home/emulicious-debugger/
